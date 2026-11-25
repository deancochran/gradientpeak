import { activityPlanAuthoringContentSchema } from "@repo/core/activity-plan";
import { describe, expect, it, vi } from "vitest";
import { E2ECleanupRegistry } from "../cleanup";
import { createE2EExecutionIdentity } from "../identity";
import { ActivityPlanFixtureBuilder } from "./activity";

describe("activity plan browser fixtures", () => {
  it.each([
    "private",
    "followers",
    "public",
  ] as const)("inserts authoring-valid %s content", async (visibility) => {
    const values = vi.fn().mockResolvedValue(undefined);
    const database = {
      requireActorByEmail: vi.fn().mockResolvedValue({ profileId: "test-owner" }),
      db: { insert: vi.fn(() => ({ values })) },
    };
    const identity = createE2EExecutionIdentity({
      parallelIndex: 0,
      processId: 42,
      project: { name: "unit" },
      repeatEachIndex: 0,
      retry: 0,
      testId: `plan-${visibility}`,
      titlePath: ["fixture"],
      workerIndex: 0,
    });
    const builder = new ActivityPlanFixtureBuilder(
      database as never,
      new E2ECleanupRegistry(),
      identity,
    );
    await builder.create({ actorEmail: "fixture@example.test", visibility });
    const row = values.mock.calls[0]?.[0];
    expect(row).toBeDefined();
    expect(
      activityPlanAuthoringContentSchema.safeParse({
        structure: row.structure,
        adaptation: row.adaptation,
        intent: { training_intent: row.training_intent },
      }).success,
    ).toBe(true);
    if (visibility === "public") {
      expect(row.structure.segments[0].intervals[0].steps[0].targets).toEqual([
        { type: "watts", intensity: 180 },
      ]);
    }
  });
});
