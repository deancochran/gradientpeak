import { describe, expect, it } from "vitest";
import { withEphemeralTimedDuration } from "./ephemeral-duration";
import { activityPlanStructureSchema } from "./structure-schema";
import { ACTIVITY_PLAN_LIMITS } from "./structure-validation";

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

const repeatedStructure = activityPlanStructureSchema.parse({
  version: 5,
  activity_category: "run",
  items: [
    {
      type: "repeat",
      id: "33333333-3333-4333-8333-333333333333",
      count: 2,
      steps: [
        {
          type: "step",
          id: "44444444-4444-4444-8444-444444444444",
          duration: { type: "time", seconds: 3 },
          targets: [{ type: "RPE", intensity: 4 }],
        },
      ],
    },
    {
      type: "step",
      id: "55555555-5555-4555-8555-555555555555",
      duration: { type: "time", seconds: 100 },
      targets: [{ type: "RPE", intensity: 6 }],
    },
  ],
});

function totalDurationSeconds(value: typeof repeatedStructure) {
  return value.items.reduce((total, item) => {
    const steps = item.type === "step" ? [item] : item.steps;
    const multiplier = item.type === "step" ? 1 : item.count;
    return (
      total +
      steps.reduce((itemTotal, step) => {
        if (step.duration.type !== "time") throw new Error("expected timed structure");
        return itemTotal + step.duration.seconds * multiplier;
      }, 0)
    );
  }, 0);
}

function repeatFixture() {
  const item = repeatedStructure.items[0];
  if (!item || item.type !== "repeat") throw new Error("expected repeat fixture");
  const step = item.steps[0];
  if (!step) throw new Error("expected repeat step fixture");
  return { item, step };
}

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

  it("allocates repeat minima before preserving proportional intent near the minimum", () => {
    const result = withEphemeralTimedDuration({
      structure: repeatedStructure,
      targetDurationSeconds: 5,
    });
    expect(result).toMatchObject({ status: "transformed", sourceDurationSeconds: 106 });
    if (result.status !== "transformed") throw new Error("expected timed transform");
    const repeatedItem = repeatedStructure.items[0];
    if (!repeatedItem || repeatedItem.type !== "repeat") throw new Error("expected repeat fixture");
    const repeatedStep = repeatedItem.steps[0];
    if (!repeatedStep) throw new Error("expected repeat step fixture");
    expect(totalDurationSeconds(result.structure)).toBe(5);
    expect(result.structure.items).toEqual([
      {
        ...repeatedItem,
        steps: [{ ...repeatedStep, duration: { type: "time", seconds: 1 } }],
      },
      { ...repeatedStructure.items[1], duration: { type: "time", seconds: 3 } },
    ]);
  });

  it("fails closed when repeat multipliers make the requested total impossible", () => {
    const repeatedItem = repeatedStructure.items[0];
    if (!repeatedItem || repeatedItem.type !== "repeat") throw new Error("expected repeat fixture");
    const repeatOnly = activityPlanStructureSchema.parse({
      ...repeatedStructure,
      items: [repeatedItem],
    });
    expect(withEphemeralTimedDuration({ structure: repeatOnly, targetDurationSeconds: 5 })).toEqual(
      {
        status: "unsupported",
        reason: "target_out_of_range",
      },
    );
  });

  it("finds a global exact allocation when proportional floors need to be undone", () => {
    const { item, step } = repeatFixture();
    const twoRepeatGroups = activityPlanStructureSchema.parse({
      ...repeatedStructure,
      items: [
        { ...item, count: 2 },
        {
          ...item,
          id: "66666666-6666-4666-8666-666666666666",
          count: 3,
          steps: [{ ...step, id: "77777777-7777-4777-8777-777777777777" }],
        },
      ],
    });
    const result = withEphemeralTimedDuration({
      structure: twoRepeatGroups,
      targetDurationSeconds: 11,
    });
    expect(result).toMatchObject({ status: "transformed" });
    if (result.status !== "transformed") throw new Error("expected exact transform");
    expect(totalDurationSeconds(result.structure)).toBe(11);
  });

  it("matches exact feasibility for small repeat multiplier sets", () => {
    for (const [firstCount, secondCount] of [
      [2, 3],
      [2, 4],
      [3, 4],
    ] as const) {
      const { item, step } = repeatFixture();
      const repeatGroups = activityPlanStructureSchema.parse({
        ...repeatedStructure,
        items: [
          { ...item, count: firstCount },
          {
            ...item,
            id: "66666666-6666-4666-8666-666666666666",
            count: secondCount,
            steps: [{ ...step, id: "77777777-7777-4777-8777-777777777777" }],
          },
        ],
      });
      const minimum = firstCount + secondCount;
      for (
        let targetDurationSeconds = minimum;
        targetDurationSeconds <= 40;
        targetDurationSeconds += 1
      ) {
        const remaining = targetDurationSeconds - minimum;
        const exists = Array.from({ length: remaining + 1 }, (_, firstExtra) =>
          Array.from(
            { length: remaining + 1 },
            (_, secondExtra) => firstCount * firstExtra + secondCount * secondExtra === remaining,
          ).some(Boolean),
        ).some(Boolean);
        const result = withEphemeralTimedDuration({
          structure: repeatGroups,
          targetDurationSeconds,
        });
        expect(result.status, `${firstCount}/${secondCount} at ${targetDurationSeconds}`).toBe(
          exists ? "transformed" : "unsupported",
        );
        if (result.status === "transformed")
          expect(totalDurationSeconds(result.structure)).toBe(targetDurationSeconds);
      }
    }
  });

  it("returns unsupported instead of parsing an overlarge per-step duration", () => {
    expect(
      withEphemeralTimedDuration({
        structure,
        targetDurationSeconds: ACTIVITY_PLAN_LIMITS.maxExplicitTimedDurationSeconds,
      }),
    ).toEqual({ status: "unsupported", reason: "target_out_of_range" });
  });
});
