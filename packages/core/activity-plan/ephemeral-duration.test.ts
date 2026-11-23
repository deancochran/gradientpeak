import { describe, expect, it } from "vitest";
import { withEphemeralTimedDuration } from "./ephemeral-duration";
import { activityPlanStructureSchema } from "./structure-schema";

const structure = activityPlanStructureSchema.parse({
  version: 5,
  activity_category: "run",
  items: [
    {
      type: "step",
      id: "11111111-1111-4111-8111-111111111111",
      duration: { type: "time", seconds: 600 },
      targets: [{ type: "RPE", intensity: 4 }],
    },
    {
      type: "step",
      id: "22222222-2222-4222-8222-222222222222",
      duration: { type: "time", seconds: 1200 },
      targets: [{ type: "RPE", intensity: 6 }],
    },
  ],
});

describe("withEphemeralTimedDuration", () => {
  it("changes only timed duration while preserving authored topology and targets", () => {
    const result = withEphemeralTimedDuration({ structure, targetDurationSeconds: 2700 });
    expect(result).toMatchObject({ status: "transformed", sourceDurationSeconds: 1800 });
    if (result.status !== "transformed") throw new Error("expected timed transform");
    expect(
      result.structure.items
        .flatMap((item) => (item.type === "step" ? [item] : item.steps))
        .map((item) => item.duration),
    ).toEqual([
      { type: "time", seconds: 900 },
      { type: "time", seconds: 1800 },
    ]);
    expect(
      result.structure.items
        .flatMap((item) => (item.type === "step" ? [item] : item.steps))
        .map((item) => item.targets),
    ).toEqual(
      structure.items
        .flatMap((item) => (item.type === "step" ? [item] : item.steps))
        .map((item) => item.targets),
    );
  });

  it("fails closed for non-timed prescriptions", () => {
    const distance = activityPlanStructureSchema.parse({
      ...structure,
      items: [
        {
          type: "step",
          id: "11111111-1111-4111-8111-111111111111",
          duration: { type: "distance", meters: 1000 },
          targets: [{ type: "RPE", intensity: 4 }],
        },
      ],
    });
    expect(withEphemeralTimedDuration({ structure: distance, targetDurationSeconds: 900 })).toEqual(
      {
        status: "unsupported",
        reason: "non_timed_structure",
      },
    );
  });
});
